import express from 'express'
const app = express()
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import cors from 'cors'
import { createRemoteJWKSet, jwtVerify } from 'jose'
const port = 5000

// todo: middleware
app.use(express.json())
app.use(cors())

//Todo: Middleware token verification
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }
  const token = authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
    )

    const { payload } = await jwtVerify(token, JWKS)
    // console.log('Verified Payload:', payload)
    req.decoded = payload
  } catch (error) {
    console.error('Token verification failed:', error)
    return res.status(401).send({
      message: 'Invalid token',
    })
  }
  next()
}

//todo: mongodb connect
const client = new MongoClient(process.env.MONGO_CLIENT_URI)
export async function connectToMongoDB() {
  try {
    await client.connect()
    console.log('You successfully connected to MongoDB!')
    return client
  } catch (err) {
    console.dir(err)
  }
}

const mongoClient = await connectToMongoDB()
const db = mongoClient.db('socialbridge')
const eventsCollection = db.collection('events')
const joinedEvents = db.collection('joinedEvents')
const eventCategoriesCollection = db.collection('categories')

//todo: create categories post => localhost:5000/categories
app.post('/categories', verifyToken, async (req, res) => {
  try {
    const { name, slug } = req.body
    if (!name || !slug) {
      return res.status(400).send({
        message: 'Category name and slug are required',
      })
    }
    const existingCategory = await eventCategoriesCollection.findOne({
      slug: slug.toLowerCase(),
    })

    if (existingCategory) {
      return res.status(409).send({
        message: 'Category already exists',
      })
    }
    const newCategory = {
      name,
      slug: slug.toLowerCase(),
      // createdAt: new Date(),
    }
    const result = await eventCategoriesCollection.insertOne(newCategory)
    res.status(201).send({
      message: 'Category created successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      message: 'Failed to create category',
    })
  }
})

//todo: get all category => localhost:5000/events/categories

app.get('/categories', async (req, res) => {
  try {
    const result = await eventCategoriesCollection.find().toArray()

    res.status(200).send({
      success: true,
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      success: false,
      message: 'Failed to fetch categories',
    })
  }
})

//todo: single category event: localhost:5000/events/categories/:slug
app.get('/categories/:slug', verifyToken, async (req, res) => {
  try {
    const { slug } = req.params
    const result = await eventsCollection
      .find({ category: slug.toLowerCase() })
      .toArray()
    res.status(200).send({
      status: 200,
      message: 'Category events fetched successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      message: 'Failed to fetch category events',
    })
  }
})

//todo: manage-events => localhost:5000/manage-events
app.get('/manage-events/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params
    const result = await eventsCollection.find({ email: email }).toArray()
    res.status(200).send({
      status: 200,
      message: 'My events fetched successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      message: 'Failed to fetch my events',
    })
  }
})

//todo: manage-events delete => localhost:5000/delete-manage-events
app.delete('/delete-manage-events/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
    })
    if (result.deletedCount === 0) {
      return res.status(404).send({
        status: 404,
        message: 'Events not found',
      })
    }

    res.status(200).send({
      status: 200,
      message: 'Event deleted successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      message: 'Failed to delete event',
    })
  }
})

//todo: manage-events update => localhost:5000/update-manage-events
app.patch('/update-manage-events/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
      },
      {
        $set: req.body,
      }
    )
    res.status(200).send({
      status: 200,
      message: 'Event updated successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({
      message: 'Failed to update event',
    })
  }
})

// todo: add to join => localhost:5000/joined-events
app.post('/joined-events', verifyToken, async (req, res) => {
  try {
    const joinedEvent = req.body
    if (!joinedEvent.participant?.email || !joinedEvent.eventId) {
      return res.status(400).send({
        message: 'Event ID and participant email are required',
      })
    }
    const alreadyJoined = await joinedEvents.findOne({
      eventId: joinedEvent.eventId,
      'participant.email': joinedEvent.participant.email,
    })
    if (alreadyJoined) {
      return res.status(409).send({
        message: 'You have already joined this event',
      })
    }
    const result = await joinedEvents.insertOne(joinedEvent)
    res.status(201).send({
      message: 'Joined event created successfully',
      insertedId: result.insertedId,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: 'Failed to create joined event',
      error: error.message,
    })
  }
})

//todo: find all joined events => localhost:5000/joined-events

app.get('/joined-events/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params
    const result = await joinedEvents
      .find({
        'participant.email': email,
      })
      .toArray()
    res.status(200).send({
      status: 200,
      message: 'Join Event fetch successfully',
      data: result,
    })
  } catch (error) {
    res.status(500).send({ error: 'Internal Server Error' })
  }
})

//todo: leave joined event => localhost:5000/leave-joined-event/:eventId

app.delete(
  '/leave-joined-events/:eventId/:email',
  verifyToken,
  async (req, res) => {
    try {
      const { eventId, email } = req.params

      const result = await joinedEvents.deleteOne({
        eventId,
        'participant.email': email,
      })

      if (result.deletedCount === 0) {
        return res.status(404).send({
          status: 404,
          message: 'Joined event not found',
        })
      }

      res.status(200).send({
        status: 200,
        message: 'Left joined event successfully',
        data: result,
      })
    } catch (error) {
      res.status(500).send({
        status: 500,
        message: 'Failed to leave joined event',
        error: error.message,
      })
    }
  }
)

// todo: create event => localhost:5000/create-events
app.post('/create-events', verifyToken, async (req, res) => {
  try {
    const createEvents = req.body
    const result = await eventsCollection.insertOne(createEvents)
    res.status(201).send({
      message: 'Event created successfully',
      insertedId: result.insertedId,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: 'Failed to create event',
      error: error.message,
    })
  }
})

//todo: find all upcoming events => localhost:5000/events
app.get('/events', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Dhaka',
    })

    const events = await eventsCollection
      .find({
        eventDate: { $gte: today },
      })
      .toArray()
    res.status(202).send({
      message: 'Upcoming events fetched successfully',
      data: events,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: 'Failed to fetch upcoming events',
      error: error.message,
      success: false,
    })
  }
})

//todo: find single event => localhost:5000/events/:id
app.get('/events/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await eventsCollection.findOne({ _id: new ObjectId(id) })
    res.status(200).send({
      message: 'Event fetched successfully',
      data: result,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: 'Failed to fetch event',
      error: error.message,
      success: false,
    })
  }
})

// todo : Recent Upcoming Events API => localhost:5000/recent-upcoming-events

app.get('/recent-upcoming-events', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Dhaka',
    })

    const recentEvents = await eventsCollection
      .find({
        eventDate: {
          $gte: today,
        },
      })
      .sort({
        eventDate: 1,
      })
      .limit(6)
      .toArray()

    res.status(200).send({
      success: true,
      message: 'Recent upcoming events fetched successfully',
      data: recentEvents,
    })
  } catch (error) {
    console.log(error)

    res.status(500).send({
      success: false,
      message: 'Failed to fetch recent upcoming events',
      error: error.message,
    })
  }
})

//todo: api home page
app.get('/', (req, res) => {
  res.send({ message: 'Welcome to Social Event Platform' })
})
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

export default app
