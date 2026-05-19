package com.lci.rtls.positioning.company;

import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.worker.Worker;
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
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * Empresa que tiene personal en la planta — interna, subcontrata o visitor.
 * Mapea {@code pos_companies}.
 *
 * <p>Tiene un manager principal ({@link #managerPerson}) que se notifica como
 * contacto de escalado cuando un trabajador de su empresa entra en una zona
 * peligrosa o tiene un incidente. El manager es una {@link Worker} (persona)
 * con {@code isCompanyManager=true}, no necesariamente trabaja en la planta.
 */
@Entity
@Table(name = "pos_companies")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CompanyType type;

    /**
     * Manager principal. Nullable a nivel DB para flexibilidad de seed/import,
     * pero la lógica de negocio exige uno para una empresa "completa".
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_person_id")
    private Worker managerPerson;

    @Column(columnDefinition = "TEXT")
    private String managerNotes;

    @Column(nullable = false)
    @Builder.Default
    private boolean isActive = true;

    @CreatedDate
    @Column(updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;
}
