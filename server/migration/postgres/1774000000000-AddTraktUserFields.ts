import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktUserFields1774000000000 implements MigrationInterface {
  name = 'AddTraktUserFields1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktUsername" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "UQ_user_traktUsername" UNIQUE ("traktUsername")`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktAccessToken" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktRefreshToken" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktTokenExpiresAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "traktConnectedAt" TIMESTAMP`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "UQ_user_traktUsername"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "traktUsername"`);
  }
}
