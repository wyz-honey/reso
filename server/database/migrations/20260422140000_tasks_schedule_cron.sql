-- 任务 Cron 调度表达式（由前端填写；后续可由调度器消费）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_cron TEXT;
