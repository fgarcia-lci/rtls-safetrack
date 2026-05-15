package com.lci.rtls.positioning.userprefs;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserViewPrefRepository extends JpaRepository<UserViewPref, Long> {

    Optional<UserViewPref> findByUsernameAndPlantViewId(String username, Long plantViewId);

    List<UserViewPref> findByUsername(String username);
}
