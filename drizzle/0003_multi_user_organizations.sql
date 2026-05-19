ALTER TABLE `users` ADD COLUMN `username` varchar(80);
ALTER TABLE `users` ADD COLUMN `passwordHash` text;
ALTER TABLE `users` ADD COLUMN `active` tinyint NOT NULL DEFAULT 1;
ALTER TABLE `users` ADD UNIQUE INDEX `users_username_unique` (`username`);

CREATE TABLE `organizations` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `name` varchar(120) NOT NULL,
  `ownerUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT now()
);

CREATE TABLE `organization_members` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `organizationId` int NOT NULL,
  `userId` int NOT NULL,
  `memberRole` enum('admin','finance','viewer') NOT NULL DEFAULT 'viewer',
  `createdAt` timestamp NOT NULL DEFAULT now()
);

ALTER TABLE `months` ADD COLUMN `organizationId` int NOT NULL DEFAULT 1;

INSERT INTO `organizations` (`id`, `name`, `ownerUserId`)
SELECT 1, 'Centro de Contas', COALESCE((SELECT `id` FROM `users` ORDER BY `id` LIMIT 1), 1)
WHERE NOT EXISTS (SELECT 1 FROM `organizations` WHERE `id` = 1);

INSERT INTO `organization_members` (`organizationId`, `userId`, `memberRole`)
SELECT 1, `id`, CASE WHEN `role` = 'admin' THEN 'admin' ELSE 'finance' END
FROM `users`
WHERE NOT EXISTS (
  SELECT 1 FROM `organization_members`
  WHERE `organization_members`.`organizationId` = 1
    AND `organization_members`.`userId` = `users`.`id`
);

UPDATE `months` SET `organizationId` = 1 WHERE `organizationId` IS NULL OR `organizationId` = 0;
