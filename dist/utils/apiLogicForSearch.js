"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMappingFromEs = void 0;
const apiLogicForCRUD_1 = require("./apiLogicForCRUD");
const elasticSearch_1 = require("./elasticSearch");
const getMappingFromEs = async (esClient) => {
    try {
        const response = await (0, elasticSearch_1.getMapping)(esClient);
        return (0, apiLogicForCRUD_1.returnBodyResponse)(false, 200, response);
    }
    catch (error) {
        return (0, apiLogicForCRUD_1.returnBodyResponse)(true, 200, error);
    }
};
exports.getMappingFromEs = getMappingFromEs;
//# sourceMappingURL=apiLogicForSearch.js.map