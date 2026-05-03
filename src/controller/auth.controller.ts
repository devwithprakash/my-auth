import { PRIVATE_KEY, PUBLIC_KEY } from "../utils/cert";
import { authTable, clientTable, userTable } from "../db/schema";
import crypto from "crypto";
import { JWTClaims } from "../utils/user-token";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";

function generateAuthCode() {
  return crypto.randomBytes(32).toString("hex");
}

const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const validatePassword = await bcrypt.compare(password, user.password);

  if (!validatePassword) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid email or password" });
  }

  req.session.userId = user.id;

  if (req.session.oauth) {
    return res.redirect("/oauth/consent");
  }

  return res.json({
    message: "login success",
  });
};

const register = async (req: Request, res: Response) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Firstname, email and password are required",
    });
  }

  const users = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  const existingUser = users[0];

  if (existingUser) {
    return res
      .status(409)
      .json({ success: false, message: "User with this email already exist" });
  }

  const hashPassword = await bcrypt.hash(password, 12);

  await db.insert(userTable).values({
    first_name: firstName,
    last_name: lastName,
    email: email,
    password: hashPassword,
  });

  return res.redirect("/oauth/authenticate");
};

const logout = async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Logout failed");
    }

    res.clearCookie("connect.sid");

    return res.redirect("http://localhost:8000");
  });
};

const authorizeClient = async (req, res: Response) => {
  const clientId = req.query.client_id as string;
  const redirectUri = req.query.redirect_uri as string;
  const state = req.query.state as string;

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.clientId, clientId))
    .limit(1);

  if (!client) {
    return res.status(404).json({ success: false, message: "Invalid client" });
  }

  if (client.redirectUri !== redirectUri) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid redirect url" });
  }

  req.session.oauth = {
    clientId,
    redirectUri,
    state,
  };

  if (!req.session.userId) {
    return res.redirect("/oauth/authenticate");
  }

  return res.redirect("/");
};

const renderConsent = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.redirect("/oauth/authenticate");
    }

    const oauth = req.session.oauth;

    if (!oauth) {
      return res.status(400).json({
        error: "oauth_session_missing",
      });
    }

    const [client] = await db
      .select()
      .from(clientTable)
      .where(eq(clientTable.clientId, oauth.clientId))
      .limit(1);

    return res.render("consent", { client });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

const codeGenerate = async (req: Request, res: Response) => {
  const { approved } = req.body;

  if (approved === false) {
    const oauth = req.session.oauth;

    return res.redirect(`${oauth.redirectUri}?error=access_denied`);
  }

  const oauth = req.session.oauth;

  if (!oauth) {
    return res.status(400).json({
      error: "oauth_context_missing",
    });
  }

  const code = generateAuthCode();

  try {
    await db.insert(authTable).values({
      code,
      userId: req.session.userId!,
      clientId: oauth.clientId,
      redirectUri: oauth.redirectUri,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      used: false,
    });
  } catch (err) {
    console.error("DB ERROR FULL:", err);
  }

  const redirectUrl =
    `${oauth.redirectUri}` + `?code=${code}` + `&state=${oauth.state}`;

  delete req.session.oauth;

  return res.redirect(redirectUrl);
};

const generateToken = async (req: Request, res: Response) => {
  const { code, client_id, client_secret, grant_type, redirect_uri } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      success: false,
      message: "unsupported_grant_type",
    });
  }

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.clientId, client_id))
    .limit(1);

  if (!client) {
    return res.status(400).json({
      success: false,
      message: "invalid_client",
    });
  }

  if (client.clientSecret !== client_secret) {
    return res.status(401).json({
      success: false,
      message: "invalid_secret",
    });
  }

  const [authCode] = await db
    .select()
    .from(authTable)
    .where(and(eq(authTable.code, code), eq(authTable.clientId, client_id)))
    .limit(1);

  if (!authCode) {
    return res.status(400).json({
      success: false,
      message: "invalid_code",
    });
  }

  if (authCode.redirectUri !== redirect_uri) {
    return res.status(400).json({
      success: false,
      message: "invalid_redirect_uri",
    });
  }

  if (authCode.used) {
    return res.status(400).json({
      success: false,
      message: "code_already_used",
    });
  }

  if (new Date() > authCode.expiresAt) {
    return res.status(400).json({
      success: false,
      message: "code_expired",
    });
  }

  await db
    .update(authTable)
    .set({ used: true })
    .where(eq(authTable.id, authCode.id));

  const ISSUER = `http://localhost:${process.env.PORT}`;
  const now = Math.floor(Date.now() / 1000);

  const accessToken = jwt.sign(
    {
      iss: ISSUER,
      sub: authCode.userId,
      aud: client_id,
      exp: now + 3600,
    },
    PRIVATE_KEY,
    { algorithm: "RS256" },
  );

  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
  });
};

const me = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const token = authHeader.split(" ")[1];

  let claims: JWTClaims;

  try {
    claims = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as JWTClaims;
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, claims.sub))
    .limit(1);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({
    sub: user.id,
    email: user.email,
    email_verified: user.emailVerified,
    given_name: user.first_name,
    family_name: user.last_name,
    name: [user.first_name, user.last_name].filter(Boolean).join(" "),
    picture: user.profileImageURL,
  });
};

export {
  login,
  register,
  me,
  authorizeClient,
  renderConsent,
  codeGenerate,
  generateToken,
  logout
};
