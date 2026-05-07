# Multi-stage Dockerfile para positioning-api.
#   - build: jdk21 + Maven Wrapper, ejecuta `mvnw package`
#   - runtime: jre21 slim, copia el jar y arranca

# ---- STAGE: build ----
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /build

# Cache de dependencias Maven
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

# Compilar
COPY src ./src
RUN ./mvnw -B -q -DskipTests package

# ---- STAGE: runtime ----
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Copiar el jar fat de Spring Boot
COPY --from=build /build/target/positioning-api-*.jar /app/app.jar

EXPOSE 8090
ENV JAVA_OPTS=""

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
