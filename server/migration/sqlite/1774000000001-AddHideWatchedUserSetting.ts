import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHideWatchedUserSetting1774000000001 implements MigrationInterface {
  name = 'AddHideWatchedUserSetting1774000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "hideWatched" boolean NOT NULL DEFAULT (0)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "hideWatched"`
    );
  }
}
