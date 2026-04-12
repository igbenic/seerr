import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleSheetsSync1780000000000 implements MigrationInterface {
  name = 'AddGoogleSheetsSync1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsAccountId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsEmail" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsAccessToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsRefreshToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsTokenExpiresAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "googleSheetsConnectedAt" datetime`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_USER_GOOGLE_SHEETS_ACCOUNT" ON "user" ("googleSheetsAccountId") `
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistSyncEnabled" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistSpreadsheetId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastSyncAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastSyncAttemptAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchlistLastError" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedSyncEnabled" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedSpreadsheetId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastSyncAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastSyncAttemptAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "googleSheetsWatchedLastError" varchar`
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
    await queryRunner.query(`DROP INDEX "IDX_USER_GOOGLE_SHEETS_ACCOUNT"`);
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
