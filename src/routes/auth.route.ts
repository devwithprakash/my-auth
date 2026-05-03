import {Router} from "express"
import * as controller from "../controller/auth.controller"

const router = Router() 

router.post("/login", controller.login)
router.post("/register", controller.register)
router.get("/me", controller.me)
router.get("/logout", controller.logout)

router.get("/authorize", controller.authorizeClient)
router.get("/consent", controller.renderConsent)
router.post("/code", controller.codeGenerate)
router.post("/token", controller.generateToken)


export default router