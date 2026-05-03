import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { authTable, clientTable, userTable } from "../db/schema";
import { Request, Response } from "express";
import { eq } from "drizzle-orm";

interface ClientInfo {
  name: string;
  email: string;
  appUrl: string;
  redirectUri: string;
}

function generateAuthorizationCode() {
  return crypto.randomBytes(32).toString("hex");
}

const hash = async (token: string): Promise<string> => {
  return bcrypt.hash(token, 12);
};

const storeClientInfo = async (req: Request, res: Response) => {
  const { name, email, appUrl, redirectUri }: ClientInfo = req.body;

  if (!name || !email || !appUrl || !redirectUri) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const clientId = crypto.randomBytes(16).toString("hex");
  const clientSecret = crypto.randomBytes(32).toString("hex");

  const hashedSecret = await hash(clientSecret);

  await db.insert(clientTable).values({
    name,
    email,
    clientId,
    appUrl,
    redirectUri,
    clientSecret: hashedSecret,
  });

  return res.status(201).json({
    message: "Client info saved",
    clientId,
  });
};

const getClientInfo = async (req: Request, res: Response) => {
  const clientId = req.params.id as string;

  const client = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.clientId, clientId))
    .limit(1);

  if (!client.length) {
    return res.status(404).json({
      success: false,
      message: "Client not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: client[0],
  });
};



export { storeClientInfo, getClientInfo };
