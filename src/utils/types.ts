export interface service {
  objectId: string;
  objectType: string;
  name: string;
  _org: string;
}
export interface planCostShare {
  objectId: string;
  objectType: string;
  name: string;
  _org: string;
  deductible: number;
}
export interface linkedPlanService {
  objectId: string;
  objectType: string;
  linkedService: service;
  _org: string;
  planserviceCostShares: planCostShare;
}

export interface mainObject {
  objectId: string;
  objectType: string;
  creationDate: string;
  planType: string;
  _org: string;
  linkedPlanServices: linkedPlanService[];
  planCostShares: planCostShare;
}
