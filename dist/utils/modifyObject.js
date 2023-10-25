"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modifyObject = void 0;
const isService = (obj) => {
    return (typeof obj.objectId === "string" &&
        typeof obj.objectType === "string" &&
        (typeof obj._org === "string" || obj._org === undefined) &&
        (typeof obj.name === "string" || obj.name === undefined));
};
const isPlanCostShare = (obj) => {
    return (typeof obj.objectId === "string" &&
        typeof obj.objectType === "string" &&
        (typeof obj._org === "string" || obj._org === undefined) &&
        (typeof obj.name === "string" || obj.name === undefined) &&
        (typeof obj.deductible === "number" || obj.deductible === undefined));
};
const isLinkedPlanService = (obj) => {
    return (typeof obj.objectId === "string" &&
        typeof obj.objectType === "string" &&
        (typeof obj.name === "string" || obj.name === undefined) &&
        (typeof obj.linkedService === undefined || isService(obj.linkedService)) &&
        (typeof obj.planserviceCostShares === undefined ||
            isPlanCostShare(obj.planserviceCostShares)));
};
const modifyObject = (earlyObj, newObject) => {
    const newKeys = Object.keys(newObject);
    const oldKeys = Object.keys(earlyObj);
    let flag = true;
    if (newKeys.includes("planCostShares")) {
        flag = flag && isPlanCostShare(newObject["planCostShares"]);
    }
    if (newKeys.includes("linkedPlanServices")) {
        newObject["linkedPlanServices"].forEach((e) => {
            flag = flag && isLinkedPlanService(e);
        });
    }
    if (!flag) {
        return "Wrong Object Type";
    }
    let updatedObject = Object.assign({}, earlyObj);
    if (newKeys.includes("planCostShares")) {
        for (let key in newObject["planCostShares"]) {
            if (updatedObject.planCostShares.hasOwnProperty(key)) {
                updatedObject.planCostShares[key] = newObject["planCostShares"][key];
            }
        }
    }
    if (newKeys.includes("linkedPlanServices")) {
        const serviceMap = new Map(updatedObject["linkedPlanServices"].map((service) => [
            service.objectId,
            service,
        ]));
        newObject["linkedPlanServices"].forEach((e) => {
            serviceMap.set(e.objectId, e);
        });
        updatedObject["linkedPlanServices"] = [...serviceMap.values()];
    }
    if (newKeys.includes("objectId")) {
        updatedObject.objectId = newObject.objectId;
    }
    return updatedObject;
};
exports.modifyObject = modifyObject;
//# sourceMappingURL=modifyObject.js.map