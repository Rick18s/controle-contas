CREATE TABLE `bank_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthId` int NOT NULL,
	`accountName` varchar(100) NOT NULL,
	`balance` decimal(12,2) NOT NULL DEFAULT '0.00',
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `bank_balances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`icon` varchar(10) DEFAULT '📋',
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `expense_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`dueDate` varchar(100) DEFAULT '',
	`value` decimal(12,2) NOT NULL DEFAULT '0.00',
	`paidValue` decimal(12,2) NOT NULL DEFAULT '0.00',
	`status` enum('pago','parcial','pendente') NOT NULL DEFAULT 'pendente',
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `expense_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `income_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`value` decimal(12,2) NOT NULL DEFAULT '0.00',
	`received` tinyint NOT NULL DEFAULT 0,
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `income_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `months` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(7) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `months_id` PRIMARY KEY(`id`)
);
