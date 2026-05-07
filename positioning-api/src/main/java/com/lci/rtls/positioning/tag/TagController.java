package com.lci.rtls.positioning.tag;

import com.lci.rtls.positioning.tag.dto.TagAssignDto;
import com.lci.rtls.positioning.tag.dto.TagCreateDto;
import com.lci.rtls.positioning.tag.dto.TagDto;
import com.lci.rtls.positioning.tag.dto.TagUpdateDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/v1/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService service;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public Page<TagDto> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String plantId,
            @RequestParam(required = false) TagState state,
            @RequestParam(required = false) Boolean isAssigned,
            @PageableDefault(size = 20, sort = "serial") Pageable pageable
    ) {
        return service.list(search, plantId, state, isAssigned, pageable);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public TagDto get(@PathVariable Long id) {
        return service.getById(id);
    }

    @GetMapping("/by-serial")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public TagDto getBySerial(@RequestParam("serial") String serial) {
        return service.getBySerial(serial);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TagDto> create(@Valid @RequestBody TagCreateDto dto) {
        TagDto created = service.create(dto);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public TagDto update(@PathVariable Long id, @Valid @RequestBody TagUpdateDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.decommission(id);
    }

    @PostMapping("/{id}/assign")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
    public TagDto assign(@PathVariable Long id, @Valid @RequestBody TagAssignDto dto) {
        return service.assign(id, dto.workerId());
    }

    @PostMapping("/{id}/unassign")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
    public TagDto unassign(@PathVariable Long id) {
        return service.unassign(id);
    }
}
