import { getNearAuth } from "../../utils/get-near-auth";

export default defineEventHandler((event) =>
  getNearAuth(event).auth.handler(toWebRequest(event)),
);
