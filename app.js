const express = require('express');
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const bodyParser = require('body-parser');
const { MaxPriorityQueue } = require('@datastructures-js/priority-queue');

const app = express();
const port = 3000;

app.use(bodyParser.json());

mongoose.connect('mongodb://localhost:27017/twitter', { useNewUrlParser: true, useUnifiedTopology: true });

const TweetSchema = new Schema({
    _id: { type: Types.ObjectId, auto: true },
    time: Number,
    next: { type: Types.ObjectId, ref: 'Tweet' },
    content: { type: String, required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
});

const UserSchema = new Schema({
    _id: { type: Types.ObjectId, auto: true },
    followed: [{ type: Types.ObjectId, ref: 'User' }],
    tweet_head: { type: Types.ObjectId, ref: 'Tweet', default: null },
    name: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);
const Tweet = mongoose.model('Tweet', TweetSchema);

app.post('/users', (req, res) => {
    const { name } = req.body;
    const newUser = new User({ name });
    newUser.followed.push(newUser._id);
    newUser.save()
        .then(() => res.status(201).json(newUser))
        .catch(error => {
            console.error(error);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        });
});

app.get('/users', async (req, res) => {
    try {
        const allUsers = await User.find().populate([
            { path: 'tweet_head', model: 'Tweet', select: 'content' },
            { path: 'followed', model: 'User', select: 'name' },
        ]);
        res.json(allUsers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.get('/users/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const user = await User.findOne({ _id: userId }).populate([
            { path: 'tweet_head', model: 'Tweet', select: 'content' },
            { path: 'followed', model: 'User', select: 'name' },
        ]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});



app.post('/postTweet', async (req, res) => {
    const { userId, content } = req.body;
    try {
        let user = await User.findOne({ _id: userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const tweet = new Tweet({ time: Date.now(), next: user.tweet_head , userId, content});
        await tweet.save();

        user.tweet_head = tweet._id;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// API endpoint to get all tweets
app.get('/tweets', async (req, res) => {
    try {
        const tweets = await Tweet.find().populate(
            { path: 'userId', model: 'User', select: 'name' },
        );
        res.json(tweets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// API endpoint to get a tweet by ID
app.get('/tweets/:id', async (req, res) => {
    const tweetId = req.params.id;

    try {
        const tweet = await Tweet.findById(tweetId);
        if (!tweet) {
            res.status(404).json({ success: false, error: 'Tweet not found' });
        } else {
            res.json(tweet);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});


app.get('/getNewsFeed/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        const user = await User.findOne({ _id: userId }).populate({
            path: 'followed', model: 'User'
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const users = user.followed;
        const q = new MaxPriorityQueue({ priority: (tweet) => tweet.time });

        for (const followee of users) {
            const tweet = await Tweet.findOne({ _id: followee.tweet_head });
            if (tweet) q.enqueue(tweet);
        }

        const sortedTweets = [];
        let n = 0;

        while (!q.isEmpty() && n<3) {
            const tweet = q.dequeue();
            sortedTweets.push(tweet.element);
            if (tweet.element.next) {
                const nextTweet = await Tweet.findOne({ _id: tweet.element.next });
                if (nextTweet) {
                    console.log("Hello in here")
                    q.enqueue(nextTweet);
                }
            }
            n++;
        }

        res.json(sortedTweets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.post('/follow', async (req, res) => {
    const { followerId, followeeId } = req.body;

    try {
        let follower = await User.findOne({ _id: followerId });

        if (!follower) {
            res.status(400).json({ success: false, error: 'Follower not found' });
            return;
        }

        const followee = await User.findOne({ _id: followeeId });

        if (!followee) {
            res.status(400).json({ success: false, error: 'Followee not found' });
            return;
        }

        follower.followed.push(followeeId);
        await follower.save();

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.post('/unfollow', async (req, res) => {
    const { followerId, followeeId } = req.body;

    try {
        const follower = await User.findOne({ _id: followerId });

        if (!follower) {
            res.status(400).json({ success: false, error: 'Follower not found' });
            return;
        }

        const index = follower.followed.indexOf(followeeId);

        if (index !== -1) {
            follower.followed.splice(index, 1);
            await follower.save();
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: 'Followee not found in follower\'s list' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
