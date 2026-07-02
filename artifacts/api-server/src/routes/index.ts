import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gigsRouter from "./gigs";
import authRouter from "./auth";
import attendanceRouter from "./attendance";
import blacklistRouter from "./blacklist";
import ratingsRouter from "./ratings";
import adminRouter from "./admin";
import adminOpsRouter from "./admin-ops";
import boronganRouter from "./borongan";
import emergencyRouter from "./emergency";
import applicationsRouter from "./applications";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gigsRouter);
router.use(attendanceRouter);
router.use(blacklistRouter);
router.use(ratingsRouter);
router.use(adminRouter);
router.use(adminOpsRouter);
router.use(boronganRouter);
router.use(emergencyRouter);
router.use(applicationsRouter);
router.use(chatRouter);

export default router;
