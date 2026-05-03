import express from "express";
import path from "path";
import jose from "node-jose";
import "dotenv/config";
import { PUBLIC_KEY } from "./utils/cert";
import session from "express-session";
import cors from "cors"

import clientRoute from "./routes/client.route";
import authRoute from "./routes/auth.route";

const app = express();
const PORT = process.env.PORT ?? 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.set("trust proxy", 1);

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true, // true only in HTTPS
      sameSite: "none",
    },
  }),
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../src/views"));

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauth?: {
      clientId: string;
      redirectUri: string;
      state: string;
    };
  }
}

app.get("/", (req, res) => console.log("Hello from server"));

app.get("/health", (req, res) => {
  res.send({ message: "Server is healthy", healthy: true });
});

app.get("/.well-known/openid-configuration", (req, res) => {
  const ISSUER = `https://my-auth-48v9.onrender.com`;

  return res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/o/authenticate`,
    userinfo_endpoint: `${ISSUER}/o/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks-json`,
  });
});

app.get("/.well-known/jwks-json", async (_, res) => {
  const key = await jose.JWK.asKey(PUBLIC_KEY, "pem");
  return res.json({ keys: [key.toJSON()] });
});

app.get("/oauth/authenticate", (req, res) => {
  return res.sendFile(path.resolve("public", "authentication.html"));
});

app.get("/oauth/register", (req, res) => {
  return res.sendFile(path.resolve("public", "signup.html"));
});


app.use("/oauth", authRoute);
app.use("/client", clientRoute);

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});
