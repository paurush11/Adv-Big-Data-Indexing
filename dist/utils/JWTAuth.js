"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyHeaderToken = exports.fetchAccessToken = void 0;
const axios_1 = __importDefault(require("axios"));
const jwt = require("jsonwebtoken");
const jwksClient = require('jwks-rsa');
async function fetchAccessToken() {
    try {
        const response = await axios_1.default.post(process.env.DOMAIN_URL || "", {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            audience: process.env.AUDIENCE,
            grant_type: process.env.GRANT_TYPE,
        }, {
            headers: {
                "content-type": "application/json",
            },
        });
        return response === null || response === void 0 ? void 0 : response.data;
    }
    catch (error) {
        throw error;
    }
}
exports.fetchAccessToken = fetchAccessToken;
const client = jwksClient({
    jwksUri: process.env.MY_KEYS
});
const getKey = (header, callBack) => {
    client.getSigningKey(header.kid, function (err, key) {
        const signingKey = key.publicKey || key.rsaPublicKey;
        callBack(null, signingKey);
    });
};
const verifyHeaderToken = (req, res, next) => {
    const token = req.headers.token;
    jwt.verify(token, getKey, {
        audience: process.env.AUDIENCE,
        issuer: process.env.ISSUER,
        algorithms: ['RS256']
    }, (err, decoded) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        else {
            next();
        }
    });
};
exports.verifyHeaderToken = verifyHeaderToken;
//# sourceMappingURL=jwtAuth.js.map