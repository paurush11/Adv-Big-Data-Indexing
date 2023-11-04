import axios from "axios";
import { NextFunction, Request, Response } from "express";

const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

export async function fetchAccessToken() {
  try {
    const response = await axios.post(
      process.env.DOMAIN_URL || "",
      {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        audience: process.env.AUDIENCE,
        grant_type: process.env.GRANT_TYPE,
      },
      {
        headers: {
          "content-type": "application/json",
        },
      },
    );

    return response?.data;
  } catch (error) {
    throw error;
  }
}
const client = jwksClient({
  jwksUri: process.env.MY_KEYS,
});

const getKey = (
  header: { kid: any },
  callBack: (arg0: null, arg1: any) => void,
) => {
  client.getSigningKey(
    header.kid,
    function (err: any, key: { publicKey: any; rsaPublicKey: any }) {
      const signingKey = key.publicKey || key.rsaPublicKey;
      callBack(null, signingKey);
    },
  );
};
export const verifyHeaderToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log(req.headers.authorization);
  const token = req.headers.token;
  const newToken = req.headers.authorization!.split(' ')[1];
  jwt.verify(
    newToken,
    getKey,
    {
      audience: process.env.AUDIENCE,
      issuer: process.env.ISSUER,
      algorithms: ["RS256"],
    },
    (err: { message: any }, decoded: any) => {
      if (err) {
        return res.status(500).send(err.message);
      } else {
        next();
      }
    },
  );
};
