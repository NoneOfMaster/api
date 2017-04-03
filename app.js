require('dotenv').config()

const express = require('express')
const app = express()
const router = express.Router()
const cors = require('cors')
const bodyParser = require('body-parser')

// sessions setup
const session = require('client-sessions')
app.use(session({
  cookieName: 'session',
  secret: process.env.DATABASE_STRING,
  duration: 30 * 60 * 1000,
  activeDuration: 5 * 60 * 1000,
}))

// initialize knex connection
const Knex = require('knex')
const knexConfig = require('./knexfile')
const knex = Knex(knexConfig.development)

// Bind all Models to a knex instance.
// For multi database systems, see the Model.bindKnex method.
const Model = require('objection').Model
Model.knex(knex)

// models
import {
  Url,
  User,
  User_Url,
} from './models'

// allow cors
app.use(cors()) // preflight POST & PATCH

// config bodyParser() for gathering POST data
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// port
const port = process.env.PORT || 3000

// check sessions data
app.use(async function(req, res, next) {
  if (req.session && req.session.user) {
    try {
      const user = await User
        .query()
        .findById(req.session.user.id)
      req.user = user // set req.user to req.session.user
      delete req.user.password_digest
      req.session.user = req.user  // refresh the session value
    } catch (er) {
      console.log(`error checking session data: ${er}`)
    }
    next()
  } else {
    next()
  }
})

app.use(router)

// middleware functions
function requireLogin (req, res, next) {
  if (!req.user) {
    res.send('No user logged in.')
  } else {
    next()
  }
}

function authorizeLogin (req, res, next) {
  if ( req.user.id === parseInt(req.params.id) ) {
    next()
  } else {
    res.send('This user is not authorized for this request.')
  }
}

///// ROUTES
router.get('/', function (req, res) {
  res.send('check check 1 2, this is root path of the api, where the docs will go')
})

// SESSIONS
router.post('/api/login',  function (req, res) {
  User
    .query()
    .findById(req.query.id)
    .then( (user) => {
      if ( user && user.password_digest === req.query.password ) {
        delete user.password_digest
        req.session.user = user
        res.send(`Session set for ${user.username}`)
      } else {
        res.send({error: 'Incorrect username or password.'})
      }
    })
    .catch( (er) => {
      console.log(er)
      res.send({ error: er })
  })
})

router.post('/api/logout', requireLogin, function (req, res) {
  req.session.reset()
  res.send("Logged out.")
})

// USERS
router.post('/api/users', function (req, res) {
  User
    .create(req.query)
    .then( (user) => res.send(user) )
    .catch( (er) => res.send(er) )
})

// add retrieval of related most visited url and shortened version
router.get('/api/users/:id', function (req, res) {
  User
    .query()
    .findById(req.params.id)
    .then( (user) => {
      if ( user ) {
        res.send(user)
      } else {
        res.send({error: 'User not found.'})
      }
    })
    .catch( (er) => res.send(er) )
})


router.patch('/api/users/:id', requireLogin, authorizeLogin, async function (req, res) {
  // research strong parameters (allows invalid field)
  User.query()
    .patchAndFetchById(req.params.id, req.query)
    .then( ( user ) => {
      if ( user ) {
        res.send( user )
      } else {
        res.send({error: 'User not found.'})
      }
    })
    .catch( (er) => res.send(er) )
})

// URLS
router.post('/api/urls', async function (req, res) {
  let address = req.query.address

    try {
    // check if URL record already exists
      let urlArr = await Url.query().where({address: address})
      if (urlArr.length) {
        // req.user undefined if no user
        urlArr[0].getNewShortened(req.user)
          .then((url) => res.send(url))
      } else {
        Url.create(address, req.user)
          .then((url) => res.send(url))
      }
    } catch(er) {
      res.send(er)
    }

})

router.get('/api/toprequestedurls', async function (req, res) {
  res.send(
    await
      Url.getMostRequested(10, ['id', 'address', 'requests'])
  )
})

router.get('/api/topvisitedurls', async function (req, res) {
  res.send(
    await
      Url.getMostVisited(10, ['id', 'address', 'visits'])
  )
})

router.get('/*', async function (req, res) {
  const shortened = req.params[0]
  let fullAddress = await Url.getFullAddress(shortened)

  if ( fullAddress.slice(0,4) !== "http" ) {
    fullAddress = "http://" + fullAddress
  }

  res.redirect(fullAddress)
})

/////

app.listen(port, () => {
  console.log(`listening on port ${port}`)
})
