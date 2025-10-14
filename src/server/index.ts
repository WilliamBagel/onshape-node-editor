import { app } from "@azure/functions";
import getfile from "./getfile";
import oauth from "./oauth";
import oauthsignin from "./oauthsignin";
import refresh from "./refresh";

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

// No default export; registration occurs at module load time
