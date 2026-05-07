package com.lci.rtls.positioning.worker;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Trabajador de la planta. Mapea {@code pos_workers}.
 *
 * <p>Independiente de {@code users} (auth) — un worker puede ser también usuario del
 * sistema (supervisor, responsable de seguridad) o no (operario sin login).
 * Ver {@code linkedUserId} y {@code supervisorUserId} (soft FK cross-DB).
 */
@Entity
@Table(name = "pos_workers")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Worker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String employeeCode;

    @Column(nullable = false, length = 200)
    private String fullName;

    @Column(length = 50)
    private String phone;

    @Column(length = 200)
    private String email;

    @Column(nullable = false, length = 200)
    private String companyName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CompanyType companyType;

    @Column(length = 100)
    private String roleInPlant;

    /** UUID del user del DT si el worker es también usuario del sistema. Nullable. */
    @Column(length = 36)
    private String linkedUserId;

    /** UUID del user del DT que es el supervisor directo de este worker. Nullable. */
    @Column(length = 36)
    private String supervisorUserId;

    private LocalDate hireDate;

    @Column(length = 500)
    private String photoUrl;

    @Column(nullable = false)
    private boolean isActive;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreatedDate
    @Column(updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    @CreatedBy
    @Column(updatable = false, length = 36)
    private String createdBy;

    @LastModifiedBy
    @Column(length = 36)
    private String updatedBy;
}
