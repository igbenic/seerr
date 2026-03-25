import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktHistoryEpisodeFields1777000000000
  implements MigrationInterface
{
  name = 'AddTraktHistoryEpisodeFields1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trakt_history" ADD "episodeTitle" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_history" ADD "seasonNumber" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_history" ADD "episodeNumber" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trakt_history" DROP COLUMN "episodeNumber"`);
    await queryRunner.query(`ALTER TABLE "trakt_history" DROP COLUMN "seasonNumber"`);
    await queryRunner.query(`ALTER TABLE "trakt_history" DROP COLUMN "episodeTitle"`);
  }
}
