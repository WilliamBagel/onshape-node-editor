import { app } from "@azure/functions";
import getfile from "./getfile";
import oauth from "./oauth";
import oauthsignin from "./oauthsignin";
import refresh from "./refresh";
import api from "./api"; // <-- added import

// Register HTTP functions
app.http("getfile", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: getfile,
});

app.http("oauth", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: oauth,
});

app.http("oauthsignin", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: oauthsignin,
});

app.http("refresh", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: refresh,
});

// Register api proxy to handle any /api/* route and forward to the api.ts handler
app.http("api", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  authLevel: "anonymous",
  route: "api/{*path}",
  handler: api,
});

// No default export; registration occurs at module load time
