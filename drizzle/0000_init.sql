CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_nocase` ON `categories` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`category_id` text,
	`description` text,
	`default_price_minor` integer NOT NULL,
	`default_cost_minor` integer,
	`archived` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "products_price_nonneg" CHECK("products"."default_price_minor" >= 0),
	CONSTRAINT "products_cost_nonneg" CHECK("products"."default_cost_minor" IS NULL OR "products"."default_cost_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text,
	`category_id` text,
	`product_name` text NOT NULL,
	`category_name` text,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`unit_cost_minor` integer,
	`line_subtotal_minor` integer NOT NULL,
	`line_net_minor` integer NOT NULL,
	`line_cost_minor` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sale_items_qty_pos" CHECK("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_price_nonneg" CHECK("sale_items"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_product_idx` ON `sale_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `sale_items_category_idx` ON `sale_items` (`category_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`order_ref` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`customer_id` text,
	`customer_name` text,
	`payment_method` text NOT NULL,
	`status` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer NOT NULL,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`cost_minor` integer,
	`notes` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sales_amounts_nonneg" CHECK("sales"."subtotal_minor" >= 0 AND "sales"."discount_minor" >= 0 AND "sales"."net_minor" >= 0 AND "sales"."tax_minor" >= 0),
	CONSTRAINT "sales_discount_le_subtotal" CHECK("sales"."discount_minor" <= "sales"."subtotal_minor"),
	CONSTRAINT "sales_status_valid" CHECK("sales"."status" IN ('completed', 'pending', 'cancelled', 'refunded')),
	CONSTRAINT "sales_payment_method_valid" CHECK("sales"."payment_method" IN ('card', 'cash', 'bank_transfer', 'e_wallet', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_order_ref_unique` ON `sales` (`order_ref`);--> statement-breakpoint
CREATE INDEX `sales_occurred_at_idx` ON `sales` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `sales_status_occurred_idx` ON `sales` (`status`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `sales_customer_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`date_format` text DEFAULT 'MMM d, yyyy' NOT NULL,
	`default_range` text DEFAULT '30d' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
