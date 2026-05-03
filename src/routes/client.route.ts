import { Router } from "express";
import * as controller from "../controller/client.controller"

const router = Router()

router.post("/", controller.storeClientInfo)
router.get("/:id", controller.getClientInfo)

export default router;

