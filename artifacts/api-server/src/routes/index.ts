import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gigsRouter from "./gigs";
import authRouter from "./auth";
import attendanceRouter from "./attendance";
import blacklistRouter from "./blacklist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gigsRouter);
router.use(attendanceRouter);
router.use(blacklistRouter);

export default router;
