"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAccessToken = exports.verifyHeaderToken = exports.generateEtag = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
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
    jwksUri: process.env.MY_KEYS,
});
const getKey = (header, callBack) => {
    client.getSigningKey(header.kid, function (err, key) {
        const signingKey = key.publicKey || key.rsaPublicKey;
        callBack(null, signingKey);
    });
};
const verifyHeaderToken = (req, res, next) => {
    const token = req.headers.token;
    const newToken = req.headers.authorization.split(" ")[1];
    jwt.verify(newToken, getKey, {
        audience: process.env.AUDIENCE,
        issuer: process.env.ISSUER,
        algorithms: ["RS256"],
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
const generateEtag = (content) => {
    return crypto.createHash("md5").update(content).digest("hex");
};
exports.generateEtag = generateEtag;
//# sourceMappingURL=jwtAuth.js.map