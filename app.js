import dotenv from "dotenv"
import https from "https"
import got from "got"
import express from "express"
import axios from "axios"
import cors from "cors"
// import { ApolloClient, gql, InMemoryCache, ApolloProvider } from '@apollo/client';
dotenv.config()

const FFLOGS_CLIENT_ID = process.env.FFLOGS_CLIENT_ID;
const FFLOGS_CLIENT_SECRET = process.env.FFLOGS_CLIENT_SECRET;
const FFLOGS_AUTH = "https://www.fflogs.com/oauth/token";
const FFLOGS_API = "https://www.fflogs.com/api/v2/client"

const FFLOGS_OPTS = {
  method: "POST",
  username: FFLOGS_CLIENT_ID,
  password: FFLOGS_CLIENT_SECRET,
  body: "grant_type=client_credentials",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded"
  }
}

class tokenCache {
    constructor() {
        this.tokenPromise = null;
        this.timer = null;
        // get the first token
        this._getNewToken().catch(err => {
            console.log("Error fetching initial token", err);
        });
    }

    getToken() {
        if (this.tokenPromise) {
            return this.tokenPromise.then(tokenData => {
                // if token has expired
                if (tokenData.expires < Date.now()) {
                    console.log('refreshing token');
                    return this._getNewToken();
                } else {
                    // console.log(`returning token: ${tokenData.token}`);
                    return tokenData.token;
                }
            });
        } else {
            return this._getNewToken();
        }
    }

    // non-public method for getting a new token
    _getNewToken() {
        this.tokenPromise = got(FFLOGS_AUTH, FFLOGS_OPTS).then(token => {
            // make resolve value be an object that contains the token and the expiration
            // set timer to get a new token automatically right before expiration
            var accessToken = JSON.parse(token["body"])["access_token"];
            var tokenExpiration = JSON.parse(token["body"])["expires_in"];
            var tokenBeforeTime = 300000; // 5 min in ms
            console.log(`\naccessToken:\n${accessToken}\n\ntokenExpiration:\n${Date.now() + tokenExpiration}\n`)
            this._scheduleTokenRefresh(tokenExpiration - tokenBeforeTime);
            return {
                token: accessToken,
                expires: Date.now() + tokenExpiration
            }
        }).catch(err => {
            // up error, clear the cached promise, log the error, keep the promise rejected
            console.log(err);
            this.tokenPromise = null;
            throw err;
        });
        return this.tokenPromise;
    }

    // schedule a call to refresh the token before it expires
    _scheduleTokenRefresh(t) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this._getNewToken().catch(err => {
                console.log("Error updating token before expiration", err);
            });
            this.timer = null;
        }, t);
    }

}

console.log(FFLOGS_CLIENT_ID + ":" + FFLOGS_CLIENT_SECRET);

const hostname = '127.0.0.1';
const port = 3000;

const server = https.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('I did it!');
});

var fflogsToken = new tokenCache();

// fflogsToken.getToken().then(token => {
//   // console.log(token)
//   const options = {
//     method: "GET",
//     searchParams: {query: query},
//     headers: {
//       "Authorization": `Bearer ${token}`
//     },
//     retry: {
//       limit: 2,
//       statusCodes: [401],
//       errorCodes: ['ERR_GOT_REQUEST_ERROR']
//     }
//   };

//   const data = got("https://www.fflogs.com/api/v2/client", options);
//   return data;
// }).then(data => {
//   var data = JSON.parse(data["body"]);
//   console.log(JSON.stringify(data, null, 2));
// });

// server.listen(port, hostname, () => {
//   console.log(`Server running at http://${hostname}:${port}/`);
// });

var app = express();

// basic get route off fflogs with reportId as query url parameter
app.get("/fflogs", (req, res, next) => {
  console.log(req.query)
  fflogsToken.getToken().then(token => {
    const query = `{
  rateLimitData {
		limitPerHour
		pointsSpentThisHour
		pointsResetIn
	}
  reportData {
    report(code: "${req.query.reportId}") {
      startTime
      endTime
      segments
      fights {
        id
        startTime
        endTime
        encounterID
        name
        fightPercentage
        bossPercentage
        kill
        friendlyPlayers
      }
      masterData {
        logVersion
        gameVersion
        lang
        actors(type: "Player") {
          gameID
          icon
          id
          name
          server
          subType
        }
      }
    }
  }
}`;
    const options = {
      method: "GET",
      searchParams: {query: query},
      headers: {
        "Authorization": `Bearer ${token}`
      }
    };
    return got(FFLOGS_API, options) 
  }).then(data => {
    res.json(JSON.parse(data["body"]))
  });
  // res.json(req.query)
});

app.listen(3000, () => {
  console.log("server running on port 3000");
});
