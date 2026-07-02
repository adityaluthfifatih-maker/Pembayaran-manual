import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gigsRouter from "./gigs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gigsRouter);

export default router;
