import { linkedPlanService, mainObject } from "./types";

const isService = (obj: any): boolean => {
  return (
    typeof obj.objectId === "string" &&
    typeof obj.objectType === "string" &&
    (typeof obj._org === "string" || obj._org === undefined) &&
    (typeof obj.name === "string" || obj.name === undefined)
  );
};
const isPlanCostShare = (obj: any): boolean => {
  return (
    typeof obj.objectId === "string" &&
    typeof obj.objectType === "string" &&
    (typeof obj._org === "string" || obj._org === undefined) &&
    (typeof obj.name === "string" || obj.name === undefined) &&
    (typeof obj.deductible === "number" || obj.deductible === undefined)
  );
};
const isLinkedPlanService = (obj: any): boolean => {
  return (
    typeof obj.objectId === "string" &&
    typeof obj.objectType === "string" &&
    (typeof obj.name === "string" || obj.name === undefined) &&
    (typeof obj.linkedService === undefined || isService(obj.linkedService)) &&
    (typeof obj.planserviceCostShares === undefined ||
      isPlanCostShare(obj.planserviceCostShares))
  );
};
/// Very wrong function, should only add to it and not check all the types

export const modifyObject = (
  earlyObj: any,
  newObject: any,
): mainObject | string => {
  const newKeys = Object.keys(newObject);
  const oldKeys = Object.keys(earlyObj);

  let flag = true;
  if (newKeys.includes("planCostShares")) {
    flag = flag && isPlanCostShare(newObject["planCostShares"]);
  }
  if (newKeys.includes("linkedPlanServices")) {
    newObject["linkedPlanServices"].forEach((e: any) => {
      flag = flag && isLinkedPlanService(e);
    });
  }

  if (!flag) {
    return "Wrong Object Type";
  }
  let updatedObject = { ...earlyObj };

  for (let key of newKeys) {
    if (key === "objectId") {
      continue;
    } else if (key !== "planCostShares" && key !== "linkedPlanServices") {
      updatedObject[key] = newObject[key];
    }
  }

  if (newKeys.includes("planCostShares")) {
    for (let key in newObject["planCostShares"]) {
      // if (updatedObject.planCostShares.hasOwnProperty(key)) {
      updatedObject.planCostShares[key] = newObject["planCostShares"][key];
      // }
    }
  }

  if (newKeys.includes("linkedPlanServices")) {
    if (!updatedObject["linkedPlanServices"]) {
      updatedObject["linkedPlanServices"] = [];
    }
    const serviceMap = new Map(
      updatedObject["linkedPlanServices"].map((service: linkedPlanService) => [
        service.objectId,
        service,
      ]),
    );
    newObject["linkedPlanServices"].forEach((e: any) => {
      serviceMap.set(e.objectId, e);
    });
    updatedObject["linkedPlanServices"] = [...serviceMap.values()];
  }

  return updatedObject as mainObject;
};
