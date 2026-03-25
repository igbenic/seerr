import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImdbUserFields1775000000000 implements MigrationInterface {
  name = 'AddImdbUserFields1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "imdbEmail" varchar`);
    await queryRunner.query(`ALTER TABLE "user" ADD "imdbAuthType" varchar`);
    await queryRunner.query(`ALTER TABLE "user" ADD "imdbPassword" varchar`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbCookieAtMain" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbConnectedAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "imdbLastImportAt" datetime`
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
