package com.lci.rtls.positioning.ingestion;

import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;

import java.util.concurrent.TimeUnit;

/**
 * Asegura el índice TTL sobre {@code tag_positions_history.ts} con la
 * expiración configurada en {@code rtls.retention.positions-history-days}.
 *
 * <p>El {@code @Indexed(expireAfter = "${...}")} solo crea el índice si NO
 * existe. Si se cambia el valor de la property y se reinicia, MongoDB no
 * actualiza el TTL existente. Este runner detecta diferencia y aplica el
 * cambio en caliente vía {@code collMod}.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class MongoTtlConfig {

    @Value("${rtls.retention.positions-history-days:7}")
    private int positionsHistoryDays;

    @Bean
    ApplicationRunner ensureTtlIndex(MongoTemplate mongo) {
        return args -> {
            long expireSeconds = TimeUnit.DAYS.toSeconds(positionsHistoryDays);
            var indexOps = mongo.indexOps(TagPositionHistory.class);
            var existing = indexOps.getIndexInfo().stream()
                    .filter(i -> "ts".equals(i.getName()) || i.getIndexFields().stream()
                            .anyMatch(f -> "ts".equals(f.getKey()) && i.getExpireAfter().isPresent()))
                    .findFirst()
                    .orElse(null);
            if (existing != null) {
                long currentSec = existing.getExpireAfter().get().toSeconds();
                if (currentSec == expireSeconds) {
                    log.info("TTL tag_positions_history ya está en {}s ({} días)", expireSeconds, positionsHistoryDays);
                    return;
                }
                log.warn("TTL tag_positions_history: {}s → recrear a {}s ({} días)", currentSec, expireSeconds, positionsHistoryDays);
                indexOps.dropIndex(existing.getName());
            }
            indexOps.ensureIndex(new Index().on("ts", org.springframework.data.domain.Sort.Direction.ASC)
                    .named("ts")
                    .expire(expireSeconds, TimeUnit.SECONDS));
            log.info("TTL tag_positions_history creado: {}s ({} días)", expireSeconds, positionsHistoryDays);
        };
    }
}
