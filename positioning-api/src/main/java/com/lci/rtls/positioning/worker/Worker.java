package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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
 * Persona del ecosistema de la planta. Mapea {@code pos_persons} (renombrada
 * desde {@code pos_workers} en V13).
 *
 * <p>Una persona puede ser cualquier combinación de: trabajador en planta
 * (lleva tag, se traquea), supervisor (recibe escalado de alertas), manager
 * de empresa (contacto de la contrata). Los flags {@code isWorkerInPlant},
 * {@code isSupervisor}, {@code isCompanyManager} marcan los roles.
 *
 * <p>Mantenemos el nombre de la clase como {@code Worker} para no romper los
 * ~140 sitios del código que la referencian; el cambio conceptual vive en la
 * BD y en los nuevos campos.
 */
@Entity
@Table(name = "pos_persons")
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

    // -------------------------------------------------------------------------
    // Roles unificados (V13). Una persona puede tener varios roles a la vez.
    // -------------------------------------------------------------------------

    @Column(name = "is_worker_in_plant", nullable = false)
    @Builder.Default
    private boolean workerInPlant = true;

    @Column(name = "is_supervisor", nullable = false)
    @Builder.Default
    private boolean supervisor = false;

    @Column(name = "is_company_manager", nullable = false)
    @Builder.Default
    private boolean companyManager = false;

    // -------------------------------------------------------------------------
    // Relaciones (todas opcionales — V13 las introduce nullables para no romper
    // datos existentes; la validación de obligatoriedad vive en service layer).
    // -------------------------------------------------------------------------

    /** Supervisor primario — escalado de alertas/SOS de este worker. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supervisor_id")
    private Worker supervisorPerson;

    /** Supervisor de respaldo si el primario no contesta. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "backup_supervisor_id")
    private Worker backupSupervisorPerson;

    /** Empresa a la que pertenece la persona (sustituye a companyName a futuro). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    // -------------------------------------------------------------------------
    // PRL — formación obligatoria. last_prl_training_date + prl_valid_months
    // determinan si está caducada hoy.
    // -------------------------------------------------------------------------

    @Column(name = "last_prl_training_date")
    private LocalDate lastPrlTrainingDate;

    @Column(name = "prl_valid_months", nullable = false)
    @Builder.Default
    private int prlValidMonths = 12;

    /** Notas internas del supervisor sobre esta persona — no visibles al worker. */
    @Column(name = "supervisor_notes", columnDefinition = "TEXT")
    private String supervisorNotes;

    // -------------------------------------------------------------------------
    // Auditoría
    // -------------------------------------------------------------------------

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
