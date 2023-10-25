import { linkedPlanService, mainObject, planCostShare } from "./types";

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
  ///shallow merge done
  if (newKeys.includes("planCostShares")) {
    for (let key in newObject["planCostShares"]) {
      if (updatedObject.planCostShares.hasOwnProperty(key)) {
        updatedObject.planCostShares[key] = newObject["planCostShares"][key];
      }
    }
  }

  if (newKeys.includes("linkedPlanServices")) {
    // Create a map of the existing services by objectId for quick look-up
    const serviceMap = new Map(
      updatedObject["linkedPlanServices"].map((service: linkedPlanService) => [
        service.objectId,
        service,
      ]),
    );

    newObject["linkedPlanServices"].forEach((e: any) => {
      // If the service exists, update it; otherwise, add it.
      serviceMap.set(e.objectId, e);
    });

    // Convert the map back to an array
    updatedObject["linkedPlanServices"] = [...serviceMap.values()];
  }
  if (newKeys.includes("objectId")) {
    (updatedObject as mainObject).objectId = newObject.objectId;
  }

  return updatedObject as mainObject;
};
