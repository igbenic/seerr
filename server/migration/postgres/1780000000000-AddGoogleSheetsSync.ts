import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleSheetsSync1780000000000 implements MigrationInterface {
  name = 'AddGoogleSheetsSync1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsAccountId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsEmail" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsAccessToken" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsRefreshToken" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsTokenExpiresAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsConnectedAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_USER_GOOGLE_SHEETS_ACCOUNT" UNIQUE ("googleSheetsAccountId")`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistSyncEnabled" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistSpreadsheetId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastSyncAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastSyncAttemptAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastError" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedSyncEnabled" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedSpreadsheetId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastSyncAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastSyncAttemptAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastError" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchedLastError"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchedLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchedLastSyncAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchedSpreadsheetId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchedSyncEnabled"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchlistLastError"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchlistLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchlistLastSyncAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchlistSpreadsheetId"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "googleSheetsWatchlistSyncEnabled"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_USER_GOOGLE_SHEETS_ACCOUNT"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsConnectedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsTokenExpiresAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsRefreshToken"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsAccessToken"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsEmail"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "googleSheetsAccountId"`
    );
  }
}
