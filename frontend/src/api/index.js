import axios from "axios";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

const client = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json"
  }
});

export const brainQuery = (query, top_k = 8, history = []) =>
  client.post("/api/brain", { query, top_k, history }).then((response) => response.data);

export const fetchCatalog = (params = {}) =>
  client.get("/api/catalog", { params }).then((response) => response.data);

export const fetchMap = (query = "") =>
  client.get("/api/map", { params: { query } }).then((response) => response.data);

export const fetchReports = (domain = "", limit = 10) =>
  client
    .get("/api/reports", { params: { ...(domain ? { domain } : {}), limit } })
    .then((response) => response.data);

export const fetchHealth = () => client.get("/api/health").then((response) => response.data);

export const apiBase = BASE;
