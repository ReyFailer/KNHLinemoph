-- KNHLinemoph — Database Schema
-- Database : line_notify_system
-- Charset  : utf8mb4_unicode_ci
-- Engine   : InnoDB (MySQL 8+ / MariaDB 10.3+)

CREATE DATABASE IF NOT EXISTS `line_notify_system`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `line_notify_system`;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE `users` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `username`       VARCHAR(100)    NOT NULL,
  `display_name`   VARCHAR(200)    NOT NULL DEFAULT '',
  `password_hash`  VARCHAR(255)    NOT NULL,
  `role`           ENUM('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
  `is_active`      TINYINT(1)      NOT NULL DEFAULT 1,
  `last_login_at`  DATETIME        NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- line_groups
-- ------------------------------------------------------------
CREATE TABLE `line_groups` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `group_name`  VARCHAR(200)  NOT NULL,
  `client_key`  VARCHAR(255)  NOT NULL DEFAULT '',
  `secret_key`  VARCHAR(255)  NOT NULL DEFAULT '',
  `api_url`     VARCHAR(500)  NOT NULL DEFAULT '',
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notification_templates
-- ------------------------------------------------------------
CREATE TABLE `notification_templates` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `template_name`    VARCHAR(200)  NOT NULL,
  `template_content` TEXT          NOT NULL,
  `variables`        JSON          NULL,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notification_items
-- ------------------------------------------------------------
CREATE TABLE `notification_items` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `item_name`    VARCHAR(200)  NOT NULL,
  `item_key`     VARCHAR(100)  NOT NULL,
  `sql_query`    TEXT          NOT NULL,
  `his_database` VARCHAR(100)  NOT NULL DEFAULT 'hos',
  `description`  VARCHAR(500)  NULL,
  `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_key` (`item_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notification_schedules
-- ------------------------------------------------------------
CREATE TABLE `notification_schedules` (
  `id`              INT UNSIGNED                    NOT NULL AUTO_INCREMENT,
  `schedule_name`   VARCHAR(200)                   NOT NULL,
  `template_id`     INT UNSIGNED                   NULL,
  `group_ids`       JSON                           NULL,
  `item_ids`        JSON                           NULL,
  `send_time`       VARCHAR(8)                     NOT NULL DEFAULT '08:00:00',
  `repeat_enabled`  TINYINT(1)                    NOT NULL DEFAULT 0,
  `repeat_interval` INT                            NULL,
  `repeat_unit`     ENUM('minutes','hours')        NULL,
  `repeat_end_time` VARCHAR(8)                     NULL,
  `next_send_time`  DATETIME                       NULL,
  `days_of_week`    VARCHAR(20)                    NOT NULL DEFAULT '1,2,3,4,5',
  `schedule_mode`   ENUM('weekly','specific')      NOT NULL DEFAULT 'weekly',
  `specific_dates`  JSON                           NULL,
  `is_active`       TINYINT(1)                    NOT NULL DEFAULT 1,
  `last_sent_date`  DATE                           NULL,
  `created_at`      DATETIME                       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME                       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_send` (`is_active`, `send_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notification_logs
-- ------------------------------------------------------------
CREATE TABLE `notification_logs` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `schedule_id`     INT UNSIGNED  NULL,
  `group_id`        INT UNSIGNED  NULL,
  `template_id`     INT UNSIGNED  NULL,
  `status_code`     SMALLINT      NULL,
  `response_text`   TEXT          NULL,
  `message_content` TEXT          NULL,
  `sent_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sent_at`     (`sent_at`),
  KEY `idx_schedule_id` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- his_databases
-- ------------------------------------------------------------
CREATE TABLE `his_databases` (
  `id`            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(100)   NOT NULL,
  `host`          VARCHAR(255)   NOT NULL,
  `port`          SMALLINT UNSIGNED NOT NULL DEFAULT 3306,
  `username`      VARCHAR(100)   NOT NULL,
  `password`      VARCHAR(255)   NOT NULL DEFAULT '',
  `database_name` VARCHAR(100)   NOT NULL,
  `description`   VARCHAR(500)   NULL,
  `is_active`     TINYINT(1)    NOT NULL DEFAULT 1,
  `is_default`    TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- system_settings  (PK = setting_key, no integer id)
-- ------------------------------------------------------------
CREATE TABLE `system_settings` (
  `setting_key`   VARCHAR(100)  NOT NULL,
  `setting_value` TEXT          NULL,
  `updated_by`    INT UNSIGNED  NULL,
  `updated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
CREATE TABLE `audit_log` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NULL,
  `username`    VARCHAR(100) NULL,
  `action`      ENUM('create','update','delete','login','logout','login_failed','export','resend','cron_run','test_send') NOT NULL,
  `target_type` ENUM('schedule','template','item','group','user','his_database','settings','log','cron') NULL,
  `target_id`   INT UNSIGNED NULL,
  `description` TEXT         NULL,
  `before_data` JSON         NULL,
  `after_data`  JSON         NULL,
  `ip_address`  VARCHAR(45)  NULL,
  `user_agent`  VARCHAR(500) NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id`    (`user_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed — system_settings default values
-- ============================================================
INSERT INTO `system_settings` (`setting_key`, `setting_value`, `updated_by`) VALUES
  ('site_title',  'ระบบแจ้งเตือน LINE', NULL),
  ('site_footer', 'KNH Line Notification System', NULL),
  ('org_name',    'โรงพยาบาล', NULL);

-- ============================================================
-- Seed — default admin user
-- password = "123456"  (bcrypt $2b$10$, compat กับ bcryptjs)
-- เปลี่ยนรหัสผ่านหลัง deploy ครั้งแรก
-- ============================================================
INSERT INTO `users` (`username`, `display_name`, `password_hash`, `role`, `is_active`) VALUES
  ('admin', 'Administrator', '$2b$10$wGfB0/OHU0uoKuXbhRLlA.SzQl/SMfG1xUd/tiW/5ygah8fVmUrT.', 'admin', 1);
