import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktWatchlistSync1778000000000
  implements MigrationInterface
{
  name = 'AddTraktWatchlistSync1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchlistSyncEnabled" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchlistLastSyncAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchlistLastSyncAttemptAt" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchlistLastError" character varying`
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_watchlist" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "watchlistEntryId" integer NOT NULL, "source" character varying NOT NULL, "mediaType" character varying NOT NULL, "traktId" integer, "tmdbId" integer, "tvdbId" integer, "imdbId" character varying, "title" character varying NOT NULL, "year" integer, "rank" integer NOT NULL, "listedAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UNIQUE_TRAKT_WATCHLIST_ENTRY" UNIQUE ("userId", "watchlistEntryId"), CONSTRAINT "PK_ef45631d485191ba8f47665c59d" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5102d664894712c1549f5636cb" ON "trakt_watchlist" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3f1e9baaeb4b6de4d122d89f20" ON "trakt_watchlist" ("watchlistEntryId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e5caf4d235996bcfdfdb8570ab" ON "trakt_watchlist" ("traktId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6956561dffb6f669f160af3420" ON "trakt_watchlist" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1cb2c76fb7ccfb4e8afb6b8dc0" ON "trakt_watchlist" ("rank") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_45f6fb4f91f2c25c26c3dfa0c4" ON "trakt_watchlist" ("listedAt") `
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_watchlist" ADD CONSTRAINT "FK_52ce6f26b38ef3d12fcbf2b0d4d" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trakt_watchlist" DROP CONSTRAINT "FK_52ce6f26b38ef3d12fcbf2b0d4d"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_45f6fb4f91f2c25c26c3dfa0c4"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1cb2c76fb7ccfb4e8afb6b8dc0"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6956561dffb6f669f160af3420"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e5caf4d235996bcfdfdb8570ab"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3f1e9baaeb4b6de4d122d89f20"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5102d664894712c1549f5636cb"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchlistLastError"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchlistLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchlistLastSyncAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchlistSyncEnabled"`
    );
  }
}
