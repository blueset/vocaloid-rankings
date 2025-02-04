// import dotenv
if (process.env.dotenv) {
  require('dotenv').config()
}

// import npm modules
const path = require("path");

const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});
const schedule = require('node-schedule')

// import custom modules
const customModuleDirectory = "./server_scripts/"
const scraper = require(customModuleDirectory + "scraper")
const partializer = require(customModuleDirectory + "partializer")
const unitConverter = require(customModuleDirectory + "unitConverter")
const databaseProxy = require(customModuleDirectory + "database")
const { generateTimestamp, caches } = require(customModuleDirectory + "shared")

const database = require("./db")
// fastify stuff
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// register apis
// v1
/*{
  const v1 = require(customModuleDirectory + "api/v1/index")

  fastify.register(v1.register, { prefix: "/api" + v1.prefix })
}*/

// register cookie engine
fastify.register(require('@fastify/cookie'), {
  secret: process.env.CookieSignatureSecret, // for cookies signature
  parseOptions: {}     // options for parsing cookies
})

// register plugins
{
  const pluginDirectory = customModuleDirectory + "fastify_plugins/"
  const plugins = [
    "handlebars_params.js",
    "cookie.js",
    "seo.js",
    "localization.js",
    "authentication.js",
    "analytics.js",
    "outgoinglink.js"
  ]
  plugins.forEach(pluginName => {
    fastify.register(require(pluginDirectory + pluginName))
  })
}

// register formbody plugin
fastify.register(require("@fastify/formbody"))

// register templating engine
const handlebars = require("handlebars")
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: handlebars,
  },
  root: path.join(__dirname, "src"),
  layout: "/partials/layouts/main-desktop.hbs",
});

// handlebars helpers
handlebars.registerHelper("get", (object, index) => {
  return object[index]
})

handlebars.registerHelper("comp", (comp1, comp2) => {
  return comp1 == comp2 ? true : null
})

handlebars.registerHelper("notcomp", (comp1, comp2) => {
  return comp1 != comp2 ? true : null
})

handlebars.registerHelper("inc", function (value, incAmount) {
  incAmount = parseInt(incAmount || 0)
  return parseInt(value) + incAmount
})

// timestamp helper
handlebars.registerHelper("timestampToDateString", function (timestamp) {
  return (new Date(timestamp) || new Date()).toDateString()
})

// short format helper
handlebars.registerHelper("shortFormat", (value) => {
  return unitConverter.shortFormat(value)
})

//long format helper
handlebars.registerHelper("longFormat", (value) => {
  return unitConverter.longFormat(value)
})

// percentage format
handlebars.registerHelper("percent", (value) => {
  return unitConverter.percentageFormat(value)
})

// localize
handlebars.registerHelper("localize", (localizationId, options) => {
  const localizationTable = options.data.root.localization
  return localizationTable[localizationId] || localizationId
})

// register partials
partializer.registerAll(handlebars)

// load and parse seo data
const seo = require("./src/seo.json");
const Song = require("./db/dataClasses/Song");
const AccessLevel = require("./db/enums/AccessLevel");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

// register page scripts
{
  const pagesDirectory = "./server_scripts/pages/"
  const pageScripts = [
    'home',
    "rankings", // the rankings page
    "settings", // settings
    "song", // song pages (add/view)
    "search", // search page
    "artist" // artist page
  ]

  pageScripts.forEach(path => {
    const module = require(pagesDirectory + path);

    fastify.register(module.register, { prefix: module.prefix || "/" })
  });
}


// update songs data function
const maxSongRefreshPromises = 15
const songRefreshFailRetryDelay = 1000 // in ms, when a song fails to refresh, how long to wait before retrying
const maxSongRefreshFailRetries = 5 // how many times a song refresh can retry on fail before giving up.
const dormantMinDailyViews = 1500 // the minimum amount of daily views a song must have before it can become dormant
const dormantMinAge = 365 * 24 * 60 * 60 // in seconds, the minimum amount of days old a song must be before it can become dormant
let updatingSongsData = false
const updateSongsData = () => {

  return new Promise(async (resolve, reject) => {

    if (updatingSongsData) { reject("Songs are already being updated."); return; }

    const timestampData = generateTimestamp()
    const timestamp = timestampData.Name

    const songsDataProxy = database.songsDataProxy

    console.log("Trying to update db for timestamp:", timestamp)
    const isAlreadyUpdated = await songsDataProxy.viewsTimestampExists(timestamp)
    if (isAlreadyUpdated) { reject("Database was already updated."); return }

    databaseProxy.setUpdating(true)

    // variables
    const updateStartTime = new Date()
    const updateStartTimeMilliseconds = updateStartTime.getTime()
    console.log("Updating database.")

    // generate exclude urls list
    const songsDataExcludeURLs = {}
    const songsDataExcludeIDs = {}
    {

      const songsIds = await songsDataProxy.getSongsIds()

      const problemSize = songsIds.length
      var progress = 0

      const refreshSong = (songId, depth = 0) => {
        return new Promise(async (resolve, reject) => {
          try {
            /** @type {Song} */
            const song = await songsDataProxy.getSong(songId)
            if (!song) { 
              console.log(`No song with ID ${songId} found.`) 
              return resolve(null) 
            }
            let URL = song.fandomUrl

            songsDataExcludeURLs[URL] = true
            songsDataExcludeIDs[songId] = true

            const existingViews = song.views
            const existingViewsTimestamp = existingViews && existingViews.timestamp
            if (song.dormant) {
              existingViews.timestamp = timestamp
              await songsDataProxy.insertSongViews(songId, existingViews)
            } else if (timestamp != existingViewsTimestamp) {
              // refresh views only
              console.log(`[Refresh ${progress}/${problemSize}] ${songId}`)
              /** @type {SongViews} */
              const songViews = await scraper.getSongViewsAsync(song, timestamp)
              if((dormantMinDailyViews >= (songViews.total - existingViews.total)) && (((updateStartTimeMilliseconds - new Date(song.publishDate).getTime())/1000) >= dormantMinAge)) {
                console.log(`[DORMANT] Make ${songId} dormant. Daily views: ${(songViews.total - existingViews.total)}. Age: ${Math.floor((updateStartTimeMilliseconds - new Date(song.publishDate).getTime()) / (24 * 60 * 60 * 1000))} days.`)
                song.dormant = true
                await songsDataProxy.updateSong(song)
              }

              await songsDataProxy.insertSongViews(songId, songViews)
            }

            databaseProxy.setUpdatingProgress(++progress / problemSize)
            resolve(songId)
          } catch (error) {
            console.log(`Error when refreshing ${songId}.`)
            console.error(error)
            if (maxSongRefreshFailRetries > depth) {
              setTimeout(async () => {
                resolve(await refreshSong(songId, depth + 1))
              }, songRefreshFailRetryDelay)
            } else {
              resolve(null)
            }
          }
        })
      }

      let promises = []

      for (const [_, id] of songsIds.entries()) {

        promises.push(refreshSong(id.id))

        if (promises.length > maxSongRefreshPromises) {
          await Promise.all(promises)
          promises = []
        }

      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    }

    // add timestamp
    songsDataProxy.insertViewsTimestamp(timestamp, new Date().toISOString())
    
    // get scraper songs
    if (!isAlreadyUpdated) {
      const scraperSongs = await scraper.getFandomSongsData(timestamp, songsDataExcludeURLs, songsDataExcludeIDs)
      for (const [_, song] of scraperSongs.entries()) {
        const songId = song.id
        const existing = await songsDataProxy.getSong(songId)
        if (existing) {
          existing.fandomUrl = song.fandomUrl
          await songsDataProxy.updateSong(existing)
        } else {
          await songsDataProxy.insertSong(song)
        }
      }
    }

    // get recent songs
    if (!isAlreadyUpdated) {
      const recentSongs = await scraper.scrapeVocaDBRecentSongsAsync();
      // process
      for (const [_, song] of recentSongs.entries()) {
        const songId = song.id
        if (!songsDataExcludeIDs[songId]) {
          await songsDataProxy.insertSong(song)
        }
      }
    }

    // purge caches
    caches.rankingsCache.purge()
    caches.songsDataCache.purge()
    caches.historicalCache.purge()

    databaseProxy.setUpdating(false)

    console.log(`Database updated. Took ${(new Date() - updateStartTime) / 1000} seconds.`)

    resolve()
  })
}

const updateSongsDataSafe = () => {
  updateSongsData().catch((error) => {
    console.log("Error occured when updating songs data:", error)
  })
}

updateSongsDataSafe()
schedule.scheduleJob('0 0 * * *', () => {
  updateSongsDataSafe()
})

// about page
fastify.get("/about", async (request, reply) => {
  const parsedCookies = request.parsedCookies

  request.addHbParams({ 
    seo: seo, 
    cookies: parsedCookies, 
    scrapeDomains: scraper.scrapeDomains, 
    pageTitle: request.localization['about_page_title']
  })

  return reply.view("pages/about.hbs", request.hbParams)
})

// download db
fastify.get("/download-db", {
  config: {
    accessLevel: AccessLevel.Admin.id,
    loginRedirect: true
  }
}, (request, reply) => {
  const fs = require("fs");
  const archiver = require("archiver")

  const directory = "data/"

  if (fs.existsSync(directory)) {
    const archive = archiver("zip")

    archive.directory(directory)

    archive.finalize()

    reply.type("application/zip").send(archive)
  }
})

// run the server
fastify.listen(
  // process.env.PORT
  { port: process.env.PORT || 8080, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
    fastify.log.info(`server listening on ${address}`);
  }
);