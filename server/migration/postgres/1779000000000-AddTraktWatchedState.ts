import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktWatchedState1779000000000 implements MigrationInterface {
  name = 'AddTraktWatchedState1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastSyncAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastSyncAttemptAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateBootstrappedAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastActivityAt" TIMESTAMP`
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_media" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "mediaType" character varying NOT NULL, "tmdbId" integer NOT NULL, "traktId" integer, "tvdbId" integer, "imdbId" character varying, "title" character varying NOT NULL, "year" integer, "plays" integer NOT NULL DEFAULT '1', "lastWatchedAt" TIMESTAMP NOT NULL, "lastUpdatedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9f78fa3ab291bddfe5704c57640" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_MEDIA_USER_MEDIA_TMBD" ON "trakt_watched_media" ("userId", "mediaType", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dab9f4bcb572765b4aa9c166cb" ON "trakt_watched_media" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9305d4c265deee232a629c5dbd" ON "trakt_watched_media" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_36dff7864c6fbaf39824448f39" ON "trakt_watched_media" ("traktId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b73f8f2620a7887af7f354e850" ON "trakt_watched_media" ("lastWatchedAt") `
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_media" ADD CONSTRAINT "FK_8a2d3819c81d0db59ee7b89b77f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_episode" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "tmdbId" integer NOT NULL, "seasonNumber" integer NOT NULL, "episodeNumber" integer NOT NULL, "plays" integer NOT NULL DEFAULT '1', "lastWatchedAt" TIMESTAMP NOT NULL, "lastUpdatedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_75082ec85d3276fd6215d681276" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_EPISODE" ON "trakt_watched_episode" ("userId", "tmdbId", "seasonNumber", "episodeNumber") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_554bb961d00f260c267c91caeb" ON "trakt_watched_episode" ("userId", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb68df4fd664b7f64e4d8a691d" ON "trakt_watched_episode" ("userId", "tmdbId", "seasonNumber") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a72945e2b4eb88267505ba513" ON "trakt_watched_episode" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce494bd12cf2048e7bc8caaf7e" ON "trakt_watched_episode" ("lastWatchedAt") `
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_episode" ADD CONSTRAINT "FK_802b355af52c1c71c91a16d555f" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_episode" DROP CONSTRAINT "FK_802b355af52c1c71c91a16d555f"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ce494bd12cf2048e7bc8caaf7e"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0a72945e2b4eb88267505ba513"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eb68df4fd664b7f64e4d8a691d"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_554bb961d00f260c267c91caeb"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_EPISODE"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_episode"`);
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_media" DROP CONSTRAINT "FK_8a2d3819c81d0db59ee7b89b77f"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b73f8f2620a7887af7f354e850"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_36dff7864c6fbaf39824448f39"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9305d4c265deee232a629c5dbd"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dab9f4bcb572765b4aa9c166cb"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_TRAKT_WATCHED_MEDIA_USER_MEDIA_TMBD"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_media"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastActivityAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateBootstrappedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastSyncAt"`
    );
  }
}
