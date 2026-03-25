import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktUserFields1774000000000 implements MigrationInterface {
  name = 'AddTraktUserFields1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "traktUsername" varchar`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_traktUsername" ON "user" ("traktUsername")`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktAccessToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktRefreshToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktTokenExpiresAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktConnectedAt" datetime`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_traktUsername"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "traktConnectedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "traktTokenExpiresAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "traktRefreshToken"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "traktAccessToken"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "traktUsername"`);
  }
}
