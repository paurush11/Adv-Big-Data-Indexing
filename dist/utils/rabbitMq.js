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
exports.receiveMessage = exports.saveESItems = exports.sendESRequest = exports.sendMessage = exports.generateCorrelationId = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const crypto = __importStar(require("crypto"));
const sendESRequest = async (fetchSavedObject, type) => {
    let message = {
        doc: fetchSavedObject,
        type: "insert",
    };
    if (type === "POST") {
        await sendMessage(JSON.stringify(message));
    }
    else if (type === "PATCH" || type === "PUT") {
        message.type = "update";
        await sendMessage(JSON.stringify(message));
    }
};
exports.sendESRequest = sendESRequest;
const rabbitMqConnection = async () => {
    const connection = await amqplib_1.default.connect(process.env.RABBITMQ_URL || "");
    const channel = await connection.createChannel();
    const requestQueue = "requestQueue";
    return {
        connection,
        channel,
        requestQueue,
    };
};
const generateCorrelationId = (planBody) => {
    return crypto
        .createHash("md5")
        .update(JSON.stringify(planBody))
        .digest("hex");
};
exports.generateCorrelationId = generateCorrelationId;
const sendMessage = async (message) => {
    const { connection, channel, requestQueue } = await rabbitMqConnection();
    await channel.assertQueue(requestQueue, { durable: false });
    console.log("message Sent");
    channel.sendToQueue(requestQueue, Buffer.from(message));
    setTimeout(() => {
        connection.close();
    }, 500);
};
exports.sendMessage = sendMessage;
const saveESItems = async (msg, esClient) => {
    try {
        const message = JSON.parse(msg);
        const type = message.type;
        if (type === "insert") {
            return await esClient.index({
                index: "plans",
                id: message.id,
                body: message.body,
            });
        }
        else {
            return await esClient.update({
                index: "plans",
                id: message.id,
                body: {
                    doc: message.body,
                },
            });
        }
    }
    catch (e) {
        console.error(e);
        return "not Done";
    }
};
exports.saveESItems = saveESItems;
const receiveMessage = async (queue, esClient, callBack) => {
    const { connection, channel } = await rabbitMqConnection();
    await channel.assertQueue(queue, { durable: false });
    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);
    channel.consume(queue, (msg) => {
        if (msg) {
            const message = JSON.parse(msg.content.toString());
            const newMessage = {
                index: "plans",
                id: message.doc.objectId,
                body: message.doc,
                type: message.type,
            };
            callBack(JSON.stringify(newMessage), esClient);
            channel.ack(msg);
        }
    }, { noAck: false });
};
exports.receiveMessage = receiveMessage;
//# sourceMappingURL=rabbitMq.js.map