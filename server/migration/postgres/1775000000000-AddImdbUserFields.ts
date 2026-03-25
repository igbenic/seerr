import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImdbUserFields1775000000000 implements MigrationInterface {
  name = 'AddImdbUserFields1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbEmail" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbAuthType" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbPassword" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbCookieAtMain" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbConnectedAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbLastImportAt" TIMESTAMP`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "imdbLastImportAt"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "imdbConnectedAt"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "imdbCookieAtMain"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "imdbPassword"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "imdbAuthType"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "imdbEmail"`);
  }
}
