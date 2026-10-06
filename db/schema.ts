import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const amanahChecks=sqliteTable('amanah_checks',{
 id:text('id').primaryKey(),
 userId:text('user_id').notNull(),
 title:text('title').notNull(),
 contentType:text('content_type').notNull(),
 requestJson:text('request_json').notNull(),
 resultJson:text('result_json').notNull(),
 analysisStatus:text('analysis_status').notNull(),
 publicationStatus:text('publication_status').notNull(),
 reviewStatus:text('review_status').notNull(),
 reviewNote:text('review_note').notNull().default(''),
 reviewedAt:text('reviewed_at'),
 reviewedBy:text('reviewed_by'),
 reviewerRole:text('reviewer_role'),
 reviewOverride:integer('review_override').notNull().default(0),
 createdAt:text('created_at').notNull(),
 updatedAt:text('updated_at').notNull(),
},table=>[index('amanah_checks_user_created_idx').on(table.userId,table.createdAt),index('amanah_checks_review_created_idx').on(table.reviewStatus,table.createdAt)]);
