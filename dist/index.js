"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const main = async () => {
    const app = (0, express_1.default)();
    app.listen(4000, () => {
        console.log("using server, ", process.env.PORT);
    });
};
main().catch((e) => {
    console.log("Error -", e);
});
//# sourceMappingURL=index.js.map