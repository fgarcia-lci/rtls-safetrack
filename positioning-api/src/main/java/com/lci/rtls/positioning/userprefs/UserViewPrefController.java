package com.lci.rtls.positioning.userprefs;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Per-user view preferences for the 3D / 2D viewer. Each call is scoped to
 * the authenticated user (JWT subject); a user can only read and write its
 * own prefs.
 *
 * <p>GET returns an empty object {@code {}} when nothing is stored yet, so
 * the frontend never has to special-case 404. PUT replaces the whole blob.
 */
@RestController
@RequestMapping("/v1/user-view-prefs")
@RequiredArgsConstructor
public class UserViewPrefController {

    private final UserViewPrefRepository repo;

    @GetMapping("/{plantViewId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> get(
            @PathVariable Long plantViewId,
            @AuthenticationPrincipal Jwt jwt) {
        String username = jwt.getSubject();
        return repo.findByUsernameAndPlantViewId(username, plantViewId)
                .map(p -> ResponseEntity.ok(p.getPrefsJson()))
                .orElseGet(() -> ResponseEntity.ok("{}"));
    }

    @PutMapping("/{plantViewId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> put(
            @PathVariable Long plantViewId,
            @RequestBody String prefsJson,
            @AuthenticationPrincipal Jwt jwt) {
        String username = jwt.getSubject();
        UserViewPref pref = repo.findByUsernameAndPlantViewId(username, plantViewId)
                .orElseGet(() -> UserViewPref.builder()
                        .username(username)
                        .plantViewId(plantViewId)
                        .build());
        pref.setPrefsJson(prefsJson);
        repo.save(pref);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
