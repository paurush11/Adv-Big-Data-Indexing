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
    for (let key of newKeys) {
        if (key === "objectId") {
            continue;
        }
        else if (key !== "planCostShares" && key !== "linkedPlanServices") {
            updatedObject[key] = newObject[key];
        }
    }
    if (newKeys.includes("planCostShares")) {
        for (let key in newObject["planCostShares"]) {
            updatedObject.planCostShares[key] = newObject["planCostShares"][key];
        }
    }
    if (newKeys.includes("linkedPlanServices")) {
        if (!updatedObject["linkedPlanServices"]) {
            updatedObject["linkedPlanServices"] = [];
        }
        const serviceMap = new Map(updatedObject["linkedPlanServices"].map((service) => [
            service.objectId,
            service,
        ]));
        newObject["linkedPlanServices"].forEach((e) => {
            serviceMap.set(e.objectId, e);
        });
        updatedObject["linkedPlanServices"] = [...serviceMap.values()];
    }
    return updatedObject;
};
exports.modifyObject = modifyObject;
//# sourceMappingURL=modifyObject.js.map