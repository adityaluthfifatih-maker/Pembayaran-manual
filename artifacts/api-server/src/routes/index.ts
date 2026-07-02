import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gigsRouter from "./gigs";
import authRouter from "./auth";
import attendanceRouter from "./attendance";
import blacklistRouter from "./blacklist";
import ratingsRouter from "./ratings";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gigsRouter);
router.use(attendanceRouter);
router.use(blacklistRouter);
router.use(ratingsRouter);
router.use(adminRouter);

export default router;
