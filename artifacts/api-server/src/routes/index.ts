import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gigsRouter from "./gigs";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gigsRouter);

export default router;
